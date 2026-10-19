# Runtime options file for Phantom, written 19/10/2026 16:40:53.5
# Options not present assume their default values
# This file is updated automatically after a full dump

# job name
             logfile =  disc01.log    ! file to which output is directed
            dumpfile =  disc_00000    ! dump file to start from

# options controlling run time and input/output
                tmax =  0.0628318531  ! end time
               dtmax =  0.0628318531  ! time between dumps
                nmax =          -1    ! maximum number of timesteps (0=just get derivs and stop)
                nout =          -1    ! write dumpfile every n dtmax (-ve=ignore)
            twallmax =      000:00    ! maximum wall time (hhh:mm, 000:00=ignore)
           nfulldump =          10    ! full dump every n dumps
            iverbose =           0    ! verboseness of log (-1=quiet 0=default 1=allsteps 2=debug 5=max)

# options controlling accuracy
              C_cour =       0.300    ! Courant factor
             C_force =       0.250    ! dt_force factor
                tolv =   1.000E-02    ! tolerance on v iterations in timestepping
               hfact =       1.200    ! h in units of particle spacing [h = hfact*n^(-1/3)]
                tolh =   1.000E-04    ! tolerance on h-n iterations

# shock capturing
      disc_viscosity =           T    ! use disc viscosity
               alpha =  0.157648466  ! MINIMUM shock viscosity parameter
            alphamax =       1.000    ! MAXIMUM shock viscosity parameter
                beta =       2.000    ! non-linear shock viscosity parameter

# options controlling equation of state
                ieos =           6    ! eqn of state (1=isoth;2=adiab;3=locally iso;8=barotropic)
                  mu =       2.381    ! mean molecular weight
               isink =           1    ! sink used as centre of locally isothermal EOS

# options relating to external forces
      iexternalforce =           0    ! 1=star,2=coro,3=bina,4=prdr,5=toru,6=toys,7=exte,8=spir,9=Lens,10=dens,11=Eins,

# options controlling physical viscosity
           irealvisc =           0    ! physical viscosity type (0=none,1=const,2=Shakura/Sunyaev)
          shearparam =       0.100    ! magnitude of shear viscosity (irealvisc=1) or alpha_SS (irealvisc=2)
            bulkvisc =       0.000    ! magnitude of bulk viscosity

# options for injecting/removing particles
               rkill =      -1.000    ! deactivate particles outside this radius (<0 is off)

# optional outputs
               curlv =           F    ! output curl v in dump files
           track_lum =           F    ! write du/dt to dump files (for a "lightcurve")
                  gw =           F    ! calculate gravitational wave strain
